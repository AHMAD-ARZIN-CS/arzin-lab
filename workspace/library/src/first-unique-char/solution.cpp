#include <iostream>
#include <string>
using namespace std;
int main() {
    string s;
    cin >> s;
    int cnt[26] = {0};
    for (char c : s) cnt[c - 'a']++;
    for (int i = 0; i < (int)s.size(); i++) if (cnt[s[i] - 'a'] == 1) { cout << i << '\n'; return 0; }
    cout << -1 << '\n';
}
