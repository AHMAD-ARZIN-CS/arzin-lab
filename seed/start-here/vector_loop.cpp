#include <iostream>
#include <vector>
using namespace std;

// Try it: press Run, then Visualize. Change the numbers or the loop and run again.
int main() {
    vector<int> nums = {4, 8, 15, 16, 23, 42};
    int total = 0;
    for (int i = 0; i < (int)nums.size(); i++) {
        nums[i] = nums[i] * 2;   // double each element in place
        total += nums[i];
    }
    cout << "doubled total = " << total << endl;
    return 0;
}
