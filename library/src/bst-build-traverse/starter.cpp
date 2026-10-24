#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* left;
    Node* right;
};

Node* insert(Node* root, int v) {
    // your code here
    return root;
}

// write inorder, preorder and height here

int main() {
    int n;
    cin >> n;
    Node* root = nullptr;
    for (int i = 0; i < n; i++) { int v; cin >> v; root = insert(root, v); }
    // print the three lines
    return 0;
}
