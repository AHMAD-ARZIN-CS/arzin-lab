#include <iostream>
#include <string>
#include <cctype>
using namespace std;
int main() {
    string s;
    getline(cin, s);
    int c = 0;
    for (char ch : s) {
        char l = tolower((unsigned char)ch);
        if (l == 'a' || l == 'e' || l == 'i' || l == 'o' || l == 'u') c++;
    }
    cout << c << '\n';
}
