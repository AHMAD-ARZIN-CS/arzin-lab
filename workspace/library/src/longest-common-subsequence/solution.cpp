#include <algorithm>
#include <iostream>
#include <string>
#include <vector>
using namespace std;
int main() {
    string a, b;
    cin >> a >> b;
    vector<vector<int>> dp(a.size() + 1, vector<int>(b.size() + 1, 0));
    for (size_t i = 1; i <= a.size(); i++)
        for (size_t j = 1; j <= b.size(); j++)
            dp[i][j] = a[i - 1] == b[j - 1] ? dp[i - 1][j - 1] + 1 : max(dp[i - 1][j], dp[i][j - 1]);
    cout << dp[a.size()][b.size()] << '\n';
}
