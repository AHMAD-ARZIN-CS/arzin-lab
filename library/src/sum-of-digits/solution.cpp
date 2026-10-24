#include <iostream>
using namespace std;
int main() {
    unsigned long long n;
    cin >> n;
    int s = 0;
    while (n > 0) { s += n % 10; n /= 10; }
    cout << s << '\n';
}
