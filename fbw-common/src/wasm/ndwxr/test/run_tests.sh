#!/bin/bash
# Native unit tests of the pure parts of ndwxr (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/ndwxr/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++17 -Wall -Wextra -Werror vd_airports_test.cpp -o ../obj/vd_airports_test
../obj/vd_airports_test
clang++ -std=c++17 -Wall -Wextra -Werror cds_display_test.cpp -o ../obj/cds_display_test
../obj/cds_display_test
clang++ -std=c++17 -Wall -Wextra -Werror wxr_controls_test.cpp -o ../obj/wxr_controls_test
../obj/wxr_controls_test
clang++ -std=c++17 -Wall -Wextra -Werror view_park_test.cpp -o ../obj/view_park_test
../obj/view_park_test
clang++ -std=c++17 -Wall -Wextra -Werror gauge_slots_test.cpp -o ../obj/gauge_slots_test
../obj/gauge_slots_test
clang++ -std=c++17 -Wall -Wextra -Werror vd_ra_zone_test.cpp -o ../obj/vd_ra_zone_test
../obj/vd_ra_zone_test
clang++ -std=c++17 -Wall -Wextra -Werror taws_system_test.cpp -o ../obj/taws_system_test
../obj/taws_system_test
clang++ -std=c++17 -Wall -Wextra -Werror threat_areas_test.cpp -o ../obj/threat_areas_test
../obj/threat_areas_test
