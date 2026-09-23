#include <stdint.h>

uint32_t square(uint32_t value) {
    return (uint32_t)((uint64_t)value * value);
}

uint32_t max(uint32_t left, uint32_t right) {
    return left > right ? left : right;
}

uint32_t factorial(uint32_t value) {
    return value == 0 ? 1 : (uint32_t)((uint64_t)value * factorial(value - 1));
}

int main(void) {
    uint32_t squared = square(6);
    return (int)(max(squared, 42) & 255u);
}