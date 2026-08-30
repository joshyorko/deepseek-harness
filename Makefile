.PHONY: homebrew

DAGGER ?= dagger
COMMIT_HASH ?= $(shell git rev-parse HEAD)

homebrew:
	rm -rf -- .artifacts/dsh-homebrew
	DAGGER_NO_NAG=1 $(DAGGER) --progress=plain call homebrew --source=. --commit-hash=$(COMMIT_HASH) export --path=.artifacts/dsh-homebrew
