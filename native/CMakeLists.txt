cmake_minimum_required(VERSION 3.21)

project(shieldbattery-zzzkbot LANGUAGES CXX)

if(NOT WIN32 OR NOT MSVC)
  message(FATAL_ERROR "ZZZKBotClient requires Windows and the Microsoft C++ compiler.")
endif()

if(NOT CMAKE_SIZEOF_VOID_P EQUAL 4)
  message(FATAL_ERROR "Configure with a 32-bit generator (for Visual Studio, pass -A Win32).")
endif()

set(CMAKE_CONFIGURATION_TYPES Release CACHE STRING "Supported build configurations" FORCE)
# All native objects, including the two static BWAPI libraries, use the static CRT so the
# distributed external client has no Visual C++ Redistributable prerequisite.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded")

set(BWAPI_SOURCE_DIR
    "${CMAKE_CURRENT_LIST_DIR}/../bwapi"
    CACHE PATH "Prepared BWAPI 4.4 source tree")
set(ZZZKBOT_SOURCE_DIR
    "${CMAKE_CURRENT_LIST_DIR}/../zzzkbot"
    CACHE PATH "Prepared ZZZKBot source tree")
set(ZZZKBOT_OUTPUT_DIR
    "${CMAKE_BINARY_DIR}/bin"
    CACHE PATH "Directory for the external-client executable")

foreach(required_path IN ITEMS
    "${BWAPI_SOURCE_DIR}/bwapi/include/BWAPI.h"
    "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/Client.cpp"
    "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/BWAPI.cpp"
    "${ZZZKBOT_SOURCE_DIR}/ZZZKBot/Source/Dll.cpp"
    "${ZZZKBOT_SOURCE_DIR}/ZZZKBot/Source/ZZZKBotAIModule.cpp")
  if(NOT EXISTS "${required_path}")
    message(FATAL_ERROR "Missing prepared source input: ${required_path}")
  endif()
endforeach()

set(CMAKE_BUILD_TYPE Release)
# CMake's Visual Studio cache omits some resolved toolchain details. Emit the values CMake actually
# selected at configure time so the build record can describe the executable without guessing from
# host environment variables after compilation.
file(WRITE "${CMAKE_BINARY_DIR}/toolchain-info.txt"
  "compiler=${CMAKE_CXX_COMPILER}\n"
  "compilerId=${CMAKE_CXX_COMPILER_ID}\n"
  "compilerVersion=${CMAKE_CXX_COMPILER_VERSION}\n"
  "windowsSdkVersion=${CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION}\n")
file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/generated/svnrev.h"
  "#pragma once\nstatic const int SVN_REV = 5016;\n#include <starcraftver.h>\n")

# BWAPI 4.4's external-client implementation. Keep these lists here rather than adding the
# upstream CMake project: its output-directory settings would write libraries into the prepared
# source tree, which must stay a verifiable input to this build.
set(BWAPI_STATIC_SOURCES
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/AIModule.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/BroodwarOutputDevice.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/BulletType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/BWAPI.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Color.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/DamageType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Error.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Event.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/ExplosionType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Filters.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Forceset.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Game.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/GameType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Order.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Player.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/PlayerType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Playerset.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Position.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Race.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Region.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Regionset.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Streams.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/TechType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Unit.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/UnitCommandType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/Unitset.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/UnitSizeType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/UnitType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/UpgradeType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/Source/WeaponType.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPILIB/UnitCommand.cpp")
add_library(BWAPIStatic STATIC ${BWAPI_STATIC_SOURCES})
target_compile_features(BWAPIStatic PUBLIC cxx_std_17)
target_compile_definitions(BWAPIStatic PRIVATE NOMINMAX)
target_include_directories(BWAPIStatic PUBLIC
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${CMAKE_CURRENT_BINARY_DIR}/generated")

# This is the exact implementation source set recorded in BWAPI's CMake/Client/CMakeLists.txt.
# Client.cpp is already instance-discovery patched in the prepared tree; do not mutate it here.
set(BWAPI_CLIENT_SOURCES
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/BulletImpl.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/Client.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/ForceImpl.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/GameImpl.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/PlayerImpl.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/RegionImpl.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source/UnitImpl.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Storm/storm.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source/Util/Exceptions.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source/Util/MemoryFrame.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source/Util/Mutex.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source/Util/RemoteProcess.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source/Util/sha1.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source/Util/SharedMemory.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared/BulletShared.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared/ForceShared.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared/GameShared.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared/PlayerShared.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared/RegionShared.cpp"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared/UnitShared.cpp")
add_library(BWAPIClient STATIC ${BWAPI_CLIENT_SOURCES})
target_compile_features(BWAPIClient PUBLIC cxx_std_17)
target_compile_definitions(BWAPIClient PRIVATE NOMINMAX)
target_include_directories(BWAPIClient PRIVATE
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${BWAPI_SOURCE_DIR}/bwapi/include/BWAPI/Client"
  "${BWAPI_SOURCE_DIR}/bwapi/BWAPIClient/Source"
  "${BWAPI_SOURCE_DIR}/bwapi/Storm"
  "${BWAPI_SOURCE_DIR}/bwapi/Util/Source"
  "${BWAPI_SOURCE_DIR}/bwapi/Shared")

set(ZZZKBOT_SOURCE_ROOT "${ZZZKBOT_SOURCE_DIR}/ZZZKBot/Source")
add_executable(ZZZKBotClient
  host.cpp
  "${ZZZKBOT_SOURCE_ROOT}/Dll.cpp"
  "${ZZZKBOT_SOURCE_ROOT}/ZZZKBotAIModule.cpp"
  "${ZZZKBOT_SOURCE_ROOT}/ZZZKBotAIModule.h")
target_compile_features(ZZZKBotClient PRIVATE cxx_std_17)
target_compile_definitions(ZZZKBotClient PRIVATE NOMINMAX WIN32 NDEBUG)
target_compile_options(ZZZKBotClient PRIVATE /W3 /MP)
target_link_options(ZZZKBotClient PRIVATE /Brepro)
target_include_directories(ZZZKBotClient PRIVATE
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${ZZZKBOT_SOURCE_ROOT}")
target_link_libraries(ZZZKBotClient PRIVATE BWAPIClient BWAPIStatic)
set_target_properties(ZZZKBotClient PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${ZZZKBOT_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${ZZZKBOT_OUTPUT_DIR}")