//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
    target: 'node',
    mode: 'development',
    entry: './daemon/index.ts',
    output: {
        path: path.resolve(__dirname, 'daemon', 'dist'),
        filename: 'index.js',
        libraryTarget: 'commonjs2',
    },
    // Bundle all dependencies - typescript is required for AST parsing
    externals: ['fsevents'],
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: path.resolve(__dirname, 'daemon', 'tsconfig.json'),
                        },
                    },
                ],
            },
        ],
    },
};

module.exports = config;
