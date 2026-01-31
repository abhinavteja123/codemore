//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const webviewConfig = {
    target: 'web',
    mode: 'none',

    entry: './webview/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'webview.js'
    },

    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
        alias: {
            '@shared': path.resolve(__dirname, 'shared')
        }
    },

    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'webview/tsconfig.json'
                        }
                    }
                ]
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },

    devtool: 'nosources-source-map',

    performance: {
        hints: false
    }
};

module.exports = webviewConfig;
