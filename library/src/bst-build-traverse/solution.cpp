#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* left;
    Node* right;
};

Node* insert(Node* root, int v) {
    if (!root) return new Node{v, nullptr, nullptr};
    if (v < root->value) root->left = insert(root->left, v);
    else if (v > root->value) root->right = insert(root->right, v);
    return root;
}
void inorder(Node* r, bool& first) { if (!r) return; inorder(r->left, first); cout << (first ? "" : " ") << r->value; first = false; inorder(r->right, first); }
void preorder(Node* r, bool& first) { if (!r) return; cout << (first ? "" : " ") << r->value; first = false; preorder(r->left, first); preorder(r->right, first); }
int height(Node* r) { return r ? 1 + max(height(r->left), height(r->right)) : 0; }

int main() {
    int n;
    cin >> n;
    Node* root = nullptr;
    for (int i = 0; i < n; i++) { int v; cin >> v; root = insert(root, v); }
    bool f = true;
    inorder(root, f); cout << endl;
    f = true;
    preorder(root, f); cout << endl;
    cout << height(root) << endl;
}
