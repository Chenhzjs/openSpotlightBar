#ifndef FILE_H
#define FILE_H
#include <string>
#include <cstdlib>
#include <unistd.h>
#include <cstdio>
#include <iostream>
#ifdef __WIN32
#include <windows.h>
#elif __APPLE__ || __linux__
#include <sys/stat.h>
#include <sys/types.h>
#endif
#include <fstream>

inline bool isExecutable(const std::string &path) {
#ifdef __WIN32
    HANDLE hFile = CreateFile(
        path.c_str(),               // 文件路径
        GENERIC_READ,               // 只读访问
        FILE_SHARE_READ,            // 共享读取
        NULL,                       // 默认安全属性
        OPEN_EXISTING,              // 仅当文件存在时打开
        FILE_ATTRIBUTE_NORMAL,      // 正常文件属性
        NULL                        // 无模板文件
    );

    if (hFile == INVALID_HANDLE_VALUE) {
        return false;
    }

    CloseHandle(hFile);
    return true;
#elif __APPLE__ || __linux__
    return access(path.c_str(), X_OK) == 0;
#endif
}

inline std::string getDirectoryFromFILE(const std::string &filepath) {
    size_t last_slash = filepath.find_last_of("/\\"); 
    if (last_slash != std::string::npos) {
        return filepath.substr(0, last_slash);
    }
    return ".";
}

inline bool saveInfoToFile(const std::string &path, const std::string &name, const std::string &info) {
    std::ofstream file;
    file.open(path + name);
    if (!file.is_open()) return false;
    file << info;
    file.close();
    return true;
}

inline std::string getInfoFromFile(const std::string &path, const std::string &name) {
    std::ifstream file;
    file.open(path + name);
    std::string info;
    if (!file.is_open()) return std::string();
    file >> info;
    file.close();
    return info;
}

#endif
