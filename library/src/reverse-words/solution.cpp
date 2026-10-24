#include <iostream>
#include <sstream>
#include <string>
#include <vector>
using namespace std;
int main() {
    string line, w;
    getline(cin, line);
    stringstream ss(line);
    vector<string> words;
    while (ss >> w) words.push_back(w);
    for (int i = (int)words.size() - 1; i >= 0; i--) cout << words[i] << (i ? " " : "");
    cout << '\n';
}
