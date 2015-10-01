# bem-blocks-introspect

Collects data about blocks files.

## Usage

```
npm i bem-blocks-introspect
bem-blocks-introspect path/to/library/to/introspect path/to/config
```

## JS API

```js
require('bem-blocks-introspect')(libFolder, config, cb);
```

Collected data will be stored in library folder in JSON format.
