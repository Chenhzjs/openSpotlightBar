#!/bin/bash
rm -r local/buf
mkdir local/buf
rm -r build
cmake -B build .
cmake --build build