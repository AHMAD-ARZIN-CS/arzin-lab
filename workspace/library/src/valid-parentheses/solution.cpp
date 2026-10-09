#include <iostream>
#include <stack>
#include <string>
using namespace std;
int main() {
    string s;
    cin >> s;
    stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else {
            char want = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (st.empty() || st.top() != want) { cout << "invalid\n"; return 0; }
            st.pop();
        }
    }
    cout << (st.empty() ? "valid" : "invalid") << '\n';
}
