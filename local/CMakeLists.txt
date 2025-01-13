cmake_minimum_required(VERSION 3.5)

project(customF LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)


set(CMAKE_CXX_FLAGS_DEBUG "-Og -g")
set(CMAKE_AUTOMOC ON)

include_directories(/opt/homebrew/Cellar/qt/6.7.3/include)
link_directories(/opt/homebrew/Cellar/qt/6.7.3/lib)

find_package(Qt6 COMPONENTS Widgets Core REQUIRED)

file(GLOB SRC 
    "*.cpp"
)

add_library(customF SHARED 
    ${SRC}
)

target_include_directories(customF PRIVATE 
    ../cmd/include
)

target_link_libraries(customF PRIVATE 
    Qt6::Widgets
    Qt6::Core
)
target_compile_options(customF PRIVATE 
    -Og -g
)
