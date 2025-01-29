#include "file.h"
#ifdef __WIN32
#include <io.h>
#endif
bool isExecutable(const std::string &path) {
#ifdef __WIN32
    // std::wstring wpath(path.begin(), path.end());
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
        // 文件无法打开
        return false;
    }

    // 文件可以打开，关闭句柄并返回 true
    CloseHandle(hFile);
    return true;
#elif __APPLE__ || __linux__
    return access(path.c_str(), X_OK) == 0;
#endif
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
//     struct _stat64 info_stat;

//     if (_stat64(path.c_str(), &info_stat) != 0) {
// #ifdef _WIN32
//         return mkdir(path.c_str()) == 0; 
// #else
//         return mkdir(path.c_str(), 0755) == 0; 
// #endif
//     }

//     file.open(path + "\\" + name); 
//     if (!file.is_open()) {
//         return false;  
//     }

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