#include <iostream>
#include <sstream>
#include <stack>
#include <string>
using namespace std;
int main() {
    string line, tok;
    getline(cin, line);
    stringstream ss(line);
    stack<long long> st;
    while (ss >> tok) {
        if (tok == "+" || tok == "-" || tok == "*" || tok == "/") {
            long long b = st.top(); st.pop();
            long long a = st.top(); st.pop();
            if (tok == "+") st.push(a + b);
            else if (tok == "-") st.push(a - b);
            else if (tok == "*") st.push(a * b);
            else st.push(a / b);
        } else st.push(stoll(tok));
    }
    cout << st.top() << '\n';
}
