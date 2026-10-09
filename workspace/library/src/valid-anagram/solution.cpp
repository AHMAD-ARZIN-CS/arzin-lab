#include <iostream>
#include <string>
using namespace std;
int main() {
    string a, b;
    cin >> a >> b;
    int cnt[26] = {0};
    for (char c : a) cnt[c - 'a']++;
    for (char c : b) cnt[c - 'a']--;
    bool ok = a.size() == b.size();
    for (int x : cnt) if (x) ok = false;
    cout << (ok ? "yes" : "no") << '\n';
}
