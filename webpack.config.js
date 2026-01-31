//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const extensionConfig = {
    target: 'node',
    mode: 'none',

    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },

    externals: {
        vscode: 'commonjs vscode'
        // tree-kill will be bundled
    },

    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@shared': path.resolve(__dirname, 'shared')
        }
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },

    devtool: 'nosources-source-map',

    infrastructureLogging: {
        level: 'log'
    }
};

module.exports = extensionConfig;
