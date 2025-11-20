cmake_minimum_required(VERSION 3.11)
project(Spotlight VERSION 1.0 LANGUAGES CXX)

set(CMAKE_PREFIX_PATH "./qt5/build")
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_CXX_FLAGS_DEBUG "-Og -g")
set(CMAKE_AUTOMOC ON)
set(CMAKE_INSTALL_PREFIX ${CMAKE_BINARY_DIR})

find_package(Qt6 COMPONENTS Widgets Core REQUIRED)

set(SPOTLIGHT_LIBS Qt6::Widgets Qt6::Core)
if(APPLE)
    list(APPEND SPOTLIGHT_LIBS "-framework Carbon")
endif()

# 公共 include
set(COMMON_INCLUDE
    ${CMAKE_SOURCE_DIR}/utils
    ${CMAKE_SOURCE_DIR}/cmd
    ${CMAKE_SOURCE_DIR}/local
    ${CMAKE_SOURCE_DIR}/window
)

# 收集所有模块的 cpp 文件
file(GLOB_RECURSE UTILS_SRC utils/*.cpp)
file(GLOB_RECURSE CMD_SRC cmd/*.cpp)
file(GLOB_RECURSE LOCAL_SRC local/*.cpp)
file(GLOB_RECURSE WINDOW_SRC window/*.cpp)
file(GLOB_RECURSE WINDOW_HEADERS window/*.h)

# 合并所有非空列表
set(SPOTLIGHT_SRC ${WINDOW_SRC} ${WINDOW_HEADERS})  # window 必须有 cpp，否则 add_executable 也会报错

if(UTILS_SRC)
    list(APPEND SPOTLIGHT_SRC ${UTILS_SRC})
endif()
if(CMD_SRC)
    list(APPEND SPOTLIGHT_SRC ${CMD_SRC})
endif()
if(LOCAL_SRC)
    list(APPEND SPOTLIGHT_SRC ${LOCAL_SRC})
endif()

add_executable(spotlight ${SPOTLIGHT_SRC} ${CMAKE_SOURCE_DIR}/main.cpp)
target_include_directories(spotlight PRIVATE
    ${CMAKE_SOURCE_DIR}/utils
    ${CMAKE_SOURCE_DIR}/cmd
    ${CMAKE_SOURCE_DIR}/local
    ${CMAKE_SOURCE_DIR}/window
)
target_link_libraries(spotlight PRIVATE ${SPOTLIGHT_LIBS})

# 自动生成 test 可执行文件
file(GLOB TEST_FILES test/test_*.cpp)
foreach(test_file ${TEST_FILES})
    get_filename_component(test_name ${test_file} NAME_WE)
    add_executable(${test_name} ${test_file} ${SPOTLIGHT_SRC})
    target_include_directories(${test_name} PRIVATE ${COMMON_INCLUDE} ${CMAKE_SOURCE_DIR}/test)
    target_link_libraries(${test_name} PRIVATE ${SPOTLIGHT_LIBS})
endforeach()
