#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long a = 1, b = 1; // ways to reach step 0 and step 1
    for (int i = 2; i <= n; i++) { long long c = a + b; a = b; b = c; }
    cout << b << '\n';
}
