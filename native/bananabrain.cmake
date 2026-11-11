# Mirrors the original Source/**/*.cpp and BWEM/*.cpp project inventory.
set(BANANABRAIN_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/../bananabrain" CACHE PATH "Prepared BananaBrain source")
set(BANANABRAIN_OUTPUT_DIR "${CMAKE_BINARY_DIR}/bin" CACHE PATH "BananaBrain executable output")
add_executable(BananaBrain host.cpp
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/BaseFinder.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/area.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/base.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/bwapiExt.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/bwem.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/cp.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/graph.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/gridMap.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/map.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/mapDrawer.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/mapImpl.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/mapPrinter.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/neutral.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/tiles.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM/utils.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/BananaBrain.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/BaseState.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/BuildingPlacement.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Configuration.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Dll.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/FastPosition.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Grids.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Information.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Macro.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Micro.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/OpponentModel.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/PathFinder.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/ProtossStrategy.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Results.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Strategy.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Tactics.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/TerranStrategy.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/UnitPotential.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/UnitUtils.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/WallPlacement.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/Worker.cpp"
  "${BANANABRAIN_SOURCE_DIR}/src/Source/ZergStrategy.cpp"
)
target_compile_features(BananaBrain PRIVATE cxx_std_17)
target_compile_definitions(BananaBrain PRIVATE SB_SINGLE_MATCH WIN32 NDEBUG NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(BananaBrain PRIVATE /W3 /MP)
target_include_directories(BananaBrain PRIVATE
  "${CMAKE_CURRENT_LIST_DIR}"
  "${BWAPI_SOURCE_DIR}/bwapi/include"
  "${BANANABRAIN_SOURCE_DIR}/src/Source"
  "${BANANABRAIN_SOURCE_DIR}/src/BWEM")
target_link_libraries(BananaBrain PRIVATE BWAPIClient BWAPIStatic)
target_link_options(BananaBrain PRIVATE /Brepro)
set_target_properties(BananaBrain PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${BANANABRAIN_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${BANANABRAIN_OUTPUT_DIR}")
