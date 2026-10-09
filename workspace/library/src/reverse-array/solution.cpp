#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    for (int i = 0, j = n - 1; i < j; i++, j--) swap(a[i], a[j]);
    for (int i = 0; i < n; i++) cout << a[i] << (i + 1 < n ? " " : "\n");
}
