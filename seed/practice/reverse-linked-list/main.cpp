#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* next;
};

Node* reverseList(Node* head) {
    // your code here
    return head;
}

int main() {
    int n;
    cin >> n;
    Node* head = nullptr;
    Node* tail = nullptr;
    for (int i = 0; i < n; i++) {
        int v;
        cin >> v;
        Node* node = new Node{v, nullptr};
        if (!head) head = node; else tail->next = node;
        tail = node;
    }
    head = reverseList(head);
    for (Node* cur = head; cur; cur = cur->next) cout << cur->value << (cur->next ? " " : "");
    cout << endl;
    return 0;
}
