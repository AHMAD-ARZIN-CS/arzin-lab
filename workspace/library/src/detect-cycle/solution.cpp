#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* next;
};

Node* readList() {          // reads n, then n values, builds the list
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
    return head;
}

void printList(Node* head) {
    if (!head) { cout << "empty" << endl; return; }
    for (Node* cur = head; cur; cur = cur->next) cout << cur->value << (cur->next ? " " : "");
    cout << endl;
}

bool hasCycle(Node* head) {
    Node* slow = head;
    Node* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) return true;
    }
    return false;
}

int main() {
    Node* head = readList();
    int pos;
    cin >> pos;
    if (pos >= 0 && head) {
        Node* target = head;
        for (int i = 0; i < pos; i++) target = target->next;
        Node* tail = head;
        while (tail->next) tail = tail->next;
        tail->next = target;
    }
    cout << (hasCycle(head) ? "cycle" : "no cycle") << endl;
}
