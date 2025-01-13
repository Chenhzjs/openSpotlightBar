#include "file.h"

bool isExecutable(const std::string &path) {
    return access(path.c_str(), X_OK) == 0;
}

std::string getDirectoryFromFILE(const std::string &filepath) {
    size_t last_slash = filepath.find_last_of("/\\"); 
    if (last_slash != std::string::npos) {
        return filepath.substr(0, last_slash); 
    }
    return "."; 
}

bool saveInfoToFile(const std::string &path, const std::string &name, const std::string &info) {
    std::ofstream file;
    struct stat info_stat;
    if (stat(path.c_str(), &info_stat) != 0) {
        return mkdir(path.c_str(), 0755) == 0;
    } 
    file.open(path + name);
    file << info;
    file.close();
    return true;
}
std::string getInfoFromFile(const std::string &path, const std::string &name) {
    std::ifstream file;
    file.open(path + name);
    std::string info;
    file >> info;
    file.close();
    return info;
}