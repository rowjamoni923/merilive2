cmake_minimum_required(VERSION 3.22.1)
project("native_video_engine")

add_library(native_video_engine SHARED
    native_video_engine.cpp
)

find_library(log-lib log)
find_library(android-lib android)
find_library(jnigraphics-lib jnigraphics)

target_link_libraries(native_video_engine
    ${log-lib}
    ${android-lib}
    ${jnigraphics-lib}
)