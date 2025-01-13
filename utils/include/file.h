#include <string>
#include <cstdlib>
#include <unistd.h>
#include <cstdio>
#include <iostream>
#include <sys/stat.h>
#include <sys/types.h>
#include <fstream>

bool isExecutable(const std::string &path);

std::string getDirectoryFromFILE(const std::string &filepath);

bool saveInfoToFile(const std::string &path, const std::string &name, const std::string &info);

std::string getInfoFromFile(const std::string &path, const std::string &name);