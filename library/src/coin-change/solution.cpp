#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> c(n);
    for (int& x : c) cin >> x;
    int amount;
    cin >> amount;
    const int INF = 1e9;
    vector<int> dp(amount + 1, INF);
    dp[0] = 0;
    for (int s = 1; s <= amount; s++)
        for (int x : c) if (x <= s && dp[s - x] + 1 < dp[s]) dp[s] = dp[s - x] + 1;
    cout << (dp[amount] >= INF ? -1 : dp[amount]) << '\n';
}
