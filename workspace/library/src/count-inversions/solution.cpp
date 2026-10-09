#include <iostream>
#include <vector>
using namespace std;
long long sortCount(vector<int>& a, vector<int>& tmp, int lo, int hi) {
    if (hi - lo <= 1) return 0;
    int mid = (lo + hi) / 2;
    long long c = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid, hi);
    int i = lo, j = mid, k = lo;
    while (i < mid && j < hi) {
        if (a[i] <= a[j]) tmp[k++] = a[i++];
        else { c += mid - i; tmp[k++] = a[j++]; }
    }
    while (i < mid) tmp[k++] = a[i++];
    while (j < hi) tmp[k++] = a[j++];
    for (int x = lo; x < hi; x++) a[x] = tmp[x];
    return c;
}
int main() {
    int n;
    cin >> n;
    vector<int> a(n), tmp(n);
    for (int& x : a) cin >> x;
    cout << sortCount(a, tmp, 0, n) << '\n';
}
