import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

// @ts-ignore
import { name, version } from './package.json';

export default defineConfig(overrideOptions => {
  const isWatch = !!overrideOptions.watch;
  const shouldPublish = !!overrideOptions.env?.publish;

  const common: Options = {
    entry: ['src/index.ts', 'src/strategies/index.ts'],
    format: ['esm', 'cjs'],
    sourcemap: true,
    dts: true,
    define: {
      PACKAGE_NAME: `"${name}"`,
      PACKAGE_VERSION: `"${version}"`,
      __DEV__: `${isWatch}`,
    },
    bundle: true,
    clean: true,
    minify: false,
  };

  return common;
});
