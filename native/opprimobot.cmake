# Mirrors the pinned BWTA2 Release project and OpprimoBot VS2013 project. Offline, debug,
# bundled binary, and obsolete worker sources are excluded from the external client.
set(BWTA2_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/../bwta2" CACHE PATH "Prepared BWTA2 source tree")
set(OPPRIMOBOT_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/../opprimobot" CACHE PATH "Prepared OpprimoBot source tree")
set(OPPRIMOBOT_BOOST_DIR "" CACHE PATH "Verified Boost 1.56.0 header root")
set(OPPRIMOBOT_OUTPUT_DIR "${CMAKE_BINARY_DIR}/bin" CACHE PATH "OpprimoBot executable output")
set(OPPRIMO_ROOT "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot")
foreach(required_path IN ITEMS
    "${BWTA2_SOURCE_DIR}/include/BWTA.h"
    "${OPPRIMO_ROOT}/Source/OpprimoBot.cpp"
    "${OPPRIMOBOT_BOOST_DIR}/boost/geometry.hpp")
  if(NOT EXISTS "${required_path}")
    message(FATAL_ERROR "Missing prepared source input: ${required_path}")
  endif()
endforeach()

set(BWTA2_SOURCES
  "${BWTA2_SOURCE_DIR}/BWTA/Source/BaseLocationImpl.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/BWTA.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/BWTA_Result.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/ChokepointImpl.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/BaseLocationGenerator.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/ClosestObjectMap.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/GraphColoring.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/LoadData.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/MapData.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/Painter.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/PolygonImpl.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/PolygonGenerator.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/RegionGenerator.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/RegionImpl.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/stdafx.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/TerrainAnalysis.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/Utils.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/BalanceMetrics.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/DistanceTransform.cpp"
  "${BWTA2_SOURCE_DIR}/BWTA/Source/Pathfinding.cpp")

add_library(BWTA2 STATIC ${BWTA2_SOURCES})
target_compile_features(BWTA2 PRIVATE cxx_std_14)
target_compile_definitions(BWTA2 PRIVATE WIN32 NDEBUG NOMINMAX _SECURE_SCL=0 _HAS_AUTO_PTR_ETC=1)
target_compile_options(BWTA2 PRIVATE /W3 /MP "/FI${BWTA2_SOURCE_DIR}/BWTA/Source/stdafx.h")
target_include_directories(BWTA2 PRIVATE
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${BWTA2_SOURCE_DIR}/include"
  "${BWTA2_SOURCE_DIR}/BWTA/Source"
  "${OPPRIMOBOT_BOOST_DIR}")

set(OPPRIMO_SOURCES
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/AIloop.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/Commander.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/ExplorationSquad.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/Protoss/ProtossMain.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/RushSquad.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/Squad.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/StrategySelector.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/Terran/TerranMain.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/UnitSetup.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/Zerg/LurkerRush.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Commander/Zerg/ZergMain.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Dll.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Influencemap/MapManager.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/MainAgents/AgentFactory.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/MainAgents/BaseAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/MainAgents/TargetingAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/MainAgents/WorkerAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/AgentManager.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/BuildingPlacer.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/BuildplanEntry.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/Constructor.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/ExplorationManager.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/ResourceManager.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/SpottedObject.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Managers/Upgrader.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/OpprimoBot.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Pathfinding/NavigationAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Pathfinding/Pathfinder.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Pathfinding/PathObj.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Pathfinding/PFFunctions.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/StructureAgents/Protoss/NexusAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/StructureAgents/RefineryAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/StructureAgents/StructureAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/StructureAgents/Terran/CommandCenterAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/StructureAgents/Terran/ComsatAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/StructureAgents/Zerg/HatcheryAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Protoss/CarrierAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Protoss/CorsairAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Protoss/HighTemplarAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Protoss/ReaverAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/BattlecruiserAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/FirebatAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/GhostAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/MarineAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/MedicAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/ScienceVesselAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/SiegeTankAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/VultureAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Terran/WraithAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/TransportAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/UnitAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Zerg/DefilerAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Zerg/HydraliskAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Zerg/LurkerAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Zerg/MutaliskAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/UnitAgents/Zerg/QueenAgent.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Utils/Config.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Utils/FileReaderUtils.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Utils/Profiler.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Utils/ProfilerObj.cpp"
  "${OPPRIMOBOT_SOURCE_DIR}/SCProjects/OpprimoBot/Source/Utils/Statistics.cpp")

add_library(OpprimoSources OBJECT ${OPPRIMO_SOURCES})
target_compile_features(OpprimoSources PRIVATE cxx_std_14)
target_compile_definitions(OpprimoSources PRIVATE WIN32 NDEBUG NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(OpprimoSources PRIVATE /W3 /MP "/FI${CMAKE_CURRENT_LIST_DIR}/opprimobot-compat.hpp")
target_include_directories(OpprimoSources PRIVATE
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${CMAKE_CURRENT_BINARY_DIR}/generated"
  "${BWTA2_SOURCE_DIR}/include"
  "${OPPRIMO_ROOT}/Source")

add_executable(OpprimoBot
  host.cpp
  $<TARGET_OBJECTS:OpprimoSources>)
target_compile_features(OpprimoBot PRIVATE cxx_std_17)
target_compile_definitions(OpprimoBot PRIVATE WIN32 NDEBUG NOMINMAX _CRT_SECURE_NO_WARNINGS SB_SINGLE_MATCH)
target_compile_options(OpprimoBot PRIVATE /W3 /MP)
target_include_directories(OpprimoBot PRIVATE
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${CMAKE_CURRENT_BINARY_DIR}/generated")
target_link_libraries(OpprimoBot PRIVATE BWTA2 BWAPIClient BWAPIStatic)
target_link_options(OpprimoBot PRIVATE /Brepro)
set_target_properties(OpprimoBot PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${OPPRIMOBOT_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${OPPRIMOBOT_OUTPUT_DIR}")

include(CTest)
if(BUILD_TESTING)
  add_executable(OpprimoGeometryTest opprimobot-tests.cpp)
  target_compile_features(OpprimoGeometryTest PRIVATE cxx_std_14)
  target_include_directories(OpprimoGeometryTest PRIVATE
    "${BWAPI_SOURCE_DIR}/bwapi/include"
    "${BWTA2_SOURCE_DIR}/include"
    "${OPPRIMO_ROOT}/Source")
  add_test(NAME OpprimoGeometryTest COMMAND OpprimoGeometryTest)
endif()
