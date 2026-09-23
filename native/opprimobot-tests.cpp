#include <vector>

#include "Utils/PolygonUtils.h"

namespace {

class TestPolygon : public BWTA::Polygon {
 public:
  const double getArea() const override { return 0.0; }
  const double getPerimeter() const override { return 0.0; }
  const BWAPI::Position getCenter() const override { return BWAPI::Position(); }
  BWAPI::Position getNearestPoint(const BWAPI::Position&) const override {
    return BWAPI::Position();
  }
  const std::vector<BWTA::Polygon*>& getHoles() const override { return holes; }

 private:
  std::vector<BWTA::Polygon*> holes;
};

bool contains(const BWTA::Polygon& polygon, int x, int y) {
  return PolygonUtils::contains(polygon, BWAPI::Position(x, y));
}

}  // namespace

int main() {
  TestPolygon square;
  square.push_back(BWAPI::Position(0, 0));
  square.push_back(BWAPI::Position(10, 0));
  square.push_back(BWAPI::Position(10, 10));
  square.push_back(BWAPI::Position(0, 10));
  if (!contains(square, 5, 5) || !contains(square, 0, 5) || !contains(square, 0, 0) ||
      contains(square, -1, 5) || contains(square, 11, 5)) {
    return 1;
  }

  TestPolygon concave;
  concave.push_back(BWAPI::Position(0, 0));
  concave.push_back(BWAPI::Position(10, 0));
  concave.push_back(BWAPI::Position(10, 10));
  concave.push_back(BWAPI::Position(5, 5));
  concave.push_back(BWAPI::Position(0, 10));
  return contains(concave, 2, 5) && !contains(concave, 5, 8) && contains(concave, 5, 5)
      ? 0
      : 1;
}