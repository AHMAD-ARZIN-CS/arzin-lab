#include <algorithm>
#include <iostream>
#include <map>
#include <string>
#include <vector>
using namespace std;
int main() {
    map<string, int> freq;
    string w;
    while (cin >> w) freq[w]++;
    vector<pair<string, int>> v(freq.begin(), freq.end());
    sort(v.begin(), v.end(), [](auto& a, auto& b) { return a.second != b.second ? a.second > b.second : a.first < b.first; });
    for (auto& [word, c] : v) cout << word << ' ' << c << '\n';
}
