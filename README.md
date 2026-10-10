# scriptron

## Project Setup

### Install

```bash
yarn install
```

On macOS this also builds `native/text-checker`, the spelling and grammar checker's bindings to
the system's checker, which needs the Xcode command line tools (`xcode-select --install`). After
changing its source, run `yarn install --force` to rebuild it.

### Development

```bash
yarn dev
```

### Build

```bash
# For windows
yarn build:win

# For macOS
yarn build:mac

# For Linux
$ npm run build:linux
```
