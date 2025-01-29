cmake_minimum_required(VERSION 3.11)

project(Spotlight VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)


set(CMAKE_CXX_FLAGS_DEBUG "-Og -g")
set(CMAKE_AUTOMOC ON)
set(CMAKE_INSTALL_PREFIX ${CMAKE_BINARY_DIR})

if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    include_directories(/opt/homebrew/Cellar/qt/6.7.3/include)
    link_directories(/opt/homebrew/Cellar/qt/6.7.3/lib)
elseif (CMAKE_SYSTEM_NAME STREQUAL "Linux")
    include_directories(/usr/include/x86_64-linux-gnu/qt6)
    link_directories(/usr/lib/x86_64-linux-gnu/qt6)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(CMAKE_PREFIX_PATH "C:/Users/Chenhz/Software/Qt/6.8.1/mingw_64/lib/cmake")
    # set(Qt6_DIR "C:/Users/Chenhz/Software/Qt/6.8.1/mingw_64/lib/cmake/Qt6")
    include_directories(C:/Users/Chenhz/Software/Qt/6.8.1/mingw_64/include)
    link_directories(C:/Users/Chenhz/Software/Qt/6.8.1/mingw_64/lib)
endif()

find_package(Qt6 COMPONENTS Widgets Core REQUIRED)

# link_directories(${CMAKE_BINARY_DIR}/lib)
# utils
file(GLOB UTILS_SRC "utils/src/*.cpp")
add_library(utils SHARED 
    ${UTILS_SRC}
)
target_include_directories(utils PRIVATE 
    utils/include
)
# cmd
add_library(cmd SHARED 
    cmd/command.cpp
)
target_include_directories(cmd PRIVATE 
    cmd/include
)

target_link_libraries(cmd PRIVATE 
    Qt6::Widgets
    Qt6::Core
    utils
)

# customF
file(GLOB LOCAL_SRC "local/*.cpp")
add_library(customF SHARED 
    ${LOCAL_SRC}
)
target_include_directories(customF PRIVATE 
    cmd/include
    utils/include
    local/include
)
target_link_libraries(customF PRIVATE 
    Qt6::Widgets
    Qt6::Core
    cmd
    utils
)
# spotlight
add_executable(spotlight 
    window/gui.cpp
    window/main.cpp
)
target_include_directories(spotlight PRIVATE 
    window/include
    cmd/include
    local/include
)
target_link_libraries(spotlight PRIVATE 
    customF
    cmd 
    Qt6::Widgets
)

