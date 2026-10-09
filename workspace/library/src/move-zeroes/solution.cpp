#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    int w = 0;
    for (int i = 0; i < n; i++) if (a[i] != 0) a[w++] = a[i];
    while (w < n) a[w++] = 0;
    for (int i = 0; i < n; i++) cout << a[i] << (i + 1 < n ? " " : "\n");
}
