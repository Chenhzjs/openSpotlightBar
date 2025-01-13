cmake_minimum_required(VERSION 3.5)

project(Spotlight VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)


set(CMAKE_CXX_FLAGS_DEBUG "-Og -g")
set(CMAKE_AUTOMOC ON)



include_directories(/opt/homebrew/Cellar/qt/6.7.3/include)
link_directories(/opt/homebrew/Cellar/qt/6.7.3/lib)

find_package(Qt6 COMPONENTS Widgets Core REQUIRED)

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
)

# customF
file(GLOB LOCAL_SRC "local/*.cpp")
add_library(customF SHARED 
    ${LOCAL_SRC}
)
target_include_directories(customF PRIVATE 
    cmd/include
    utils/include
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
)
target_link_libraries(spotlight PRIVATE 
    customF
    cmd 
    Qt6::Widgets
)

