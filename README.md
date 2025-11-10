# openSpotlishtBar

## build

### build qt6
```bash
git submodule --init
cd qt5
git checkout v6.10.0
./init-repository --module-subset=qtbase
./configure -prefix ./build
cmake --build .
cmake --install .
```

### build project
```bash
./setup.sh
```
