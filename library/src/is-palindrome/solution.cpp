#include <iostream>
#include <string>
#include <cctype>
using namespace std;
int main() {
    string s, t;
    getline(cin, s);
    for (char c : s) if (isalnum((unsigned char)c)) t += tolower((unsigned char)c);
    bool ok = true;
    for (size_t i = 0, j = t.size(); i + 1 < j; i++, j--) if (t[i] != t[j - 1]) { ok = false; break; }
    cout << (ok ? "yes" : "no") << '\n';
}
