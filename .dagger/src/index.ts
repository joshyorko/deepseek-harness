/** Build release-shaped dsh CLI artifacts and local Homebrew input. */
import { dag, Container, Directory, func, object } from "@dagger.io/dagger"

const NODE_IMAGE = "node:24-bookworm"
const DEFAULT_COMMIT_HASH = "0000000"

interface RootManifest {
  version: string
}

/** Read the release version owned by the repository root manifest. */
async function rootManifest(source: Directory): Promise<RootManifest> {
  const parsed: unknown = JSON.parse(await source.file("package.json").contents())
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("package.json must contain an object")
  }
  const version = (parsed as Record<string, unknown>).version
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("package.json must contain a publishable semantic version")
  }
  return { version }
}

/** Render the local formula that installs every packed local workspace dependency. */
function homebrewFormula(version: string, archiveName: string, sha256: string): string {
  return `# frozen_string_literal: true

require "json"

# Formula for the Dagger-built DeepSeek Harness CLI.
class Dsh < Formula
  desc "DeepSeek Harness command-line agent runtime"
  homepage "https://github.com/deepseek-ai/deepseek-harness"
  url "file://#{File.expand_path(\"../${archiveName}\", __dir__)}"
  version "${version}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "cmake" => :build
  depends_on "node@24"

  allow_network_access! :build

  def install
    tarballs = Dir[buildpath/"packages/*.tgz"]
    tarballs = Dir[buildpath/"*.tgz"] if tarballs.empty?
    raise "dsh Homebrew archive contains no npm tarballs" if tarballs.empty?

    dependencies = {}
    tarballs.each do |tarball|
      manifest = JSON.parse(Utils.safe_popen_read("tar", "-xOzf", tarball.to_s, "package/package.json"))
      dependencies[manifest.fetch("name")] = "file:#{tarball}"
    end

    consumer = buildpath/"consumer"
    consumer.mkpath
    (consumer/"package.json").write(JSON.pretty_generate({
      name:         "dsh-homebrew-install",
      version:      "0.0.0",
      private:      true,
      dependencies: dependencies,
    }))
    npm = formula_opt_bin("node@24")/"npm"
    consumer.cd do
      system npm, "install", "--no-audit", "--no-fund", "--package-lock=false"
    end
    libexec.install consumer/"node_modules", consumer/"package.json"

    if OS.linux?
      libexec.glob("node_modules/**/@koromix/koffi-linux-*/musl_*").each { |path| rm_r(path) }
    end

    (bin/"dsh").write <<~SH
      #!/usr/bin/env bash
      exec "#{formula_opt_bin("node@24")}/node" "#{libexec}/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"
    SH
    chmod 0755, bin/"dsh"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/dsh --version").strip
  end
end
`
}

@object()
export class Dsh {
  /** Build and verify the local release-family tarballs through the same Node 24 steps used by Actions. */
  private releaseBundle(source: Directory, commitHash: string): Container {
    if (!/^[0-9a-f]{7,40}$/.test(commitHash)) {
      throw new Error("commitHash must contain 7 to 40 lowercase hexadecimal characters")
    }
    return dag
      .container()
      .from(NODE_IMAGE)
      .withEnvVariable("CI", "true")
      .withEnvVariable("DSH_CLIENT_COMMIT_HASH", commitHash)
      .withEnvVariable("DSH_TELEMETRY_DISABLED", "1")
      .withEnvVariable("PNPM_CONFIG_STORE_DIR", "/pnpm/store")
      .withMountedCache("/pnpm/store", dag.cacheVolume("dsh-pnpm-store"))
      .withDirectory("/src", source, {
        gitignore: true,
        exclude: [".git", ".git/**", ".dagger", ".dagger/**", "dagger.json"],
      })
      .withWorkdir("/src")
      .withExec(["find", ".", "-depth", "-type", "d", "-empty", "-delete"])
      .withExec(["corepack", "enable"])
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "run", "release:verify", "--family", "dsh"])
      .withExec(["pnpm", "run", "build:official"])
      .withExec(["pnpm", "run", "release:pack", "--family", "dsh", "--out", "dist/npm"])
      .withExec(["pnpm", "run", "release:pack", "--family", "vendor", "--out", "dist/npm-vendor"])
      .withExec(["pnpm", "--dir", "native/landlock-run", "run", "build:ts"])
      .withExec([
        "pnpm",
        "--dir",
        "native/landlock-run/packages/entry",
        "pack",
        "--pack-destination",
        "/src/dist/npm-landlock",
      ])
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "--yes", "--no-install-recommends", "cmake"])
      .withExec([
        "pnpm",
        "run",
        "release:verify-packed-install",
        "--family",
        "dsh",
        "--from",
        "dist/npm",
        "--from",
        "dist/npm-vendor",
        "--from",
        "dist/npm-landlock",
      ])
  }

  /**
   * Build a local Homebrew source archive and formula for the dsh CLI.
   *
   * @param source Repository checkout to build.
   * @param commitHash Lowercase hexadecimal source revision embedded in client artifacts.
   */
  @func()
  async homebrew(source: Directory, commitHash: string = DEFAULT_COMMIT_HASH): Promise<Directory> {
    const { version } = await rootManifest(source)
    const archiveName = `dsh-homebrew-${version}.tar.gz`
    const release = this.releaseBundle(source, commitHash)
      .withExec(["mkdir", "-p", "/out/packages"])
      .withExec([
        "sh",
        "-c",
        "cp dist/npm/*.tgz dist/npm-vendor/*.tgz dist/npm-landlock/*.tgz /out/packages/",
      ])
      .withExec(["tar", "-C", "/out", "-czf", `/out/${archiveName}`, "packages"])

    const checksum = (await release
      .withExec(["sha256sum", `/out/${archiveName}`])
      .stdout())
      .trim()
      .split(/\s+/, 1)[0]
    if (!/^[0-9a-f]{64}$/.test(checksum)) {
      throw new Error(`sha256sum returned an invalid digest: ${JSON.stringify(checksum)}`)
    }

    return dag
      .directory()
      .withFile(archiveName, release.file(`/out/${archiveName}`))
      .withNewFile("Formula/dsh.rb", homebrewFormula(version, archiveName, checksum))
  }
}
