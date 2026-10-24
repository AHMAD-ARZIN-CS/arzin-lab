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

Node* merge(Node* a, Node* b) {
    Node dummy{0, nullptr};
    Node* tail = &dummy;
    while (a && b) {
        if (a->value <= b->value) { tail->next = a; a = a->next; }
        else { tail->next = b; b = b->next; }
        tail = tail->next;
    }
    tail->next = a ? a : b;
    return dummy.next;
}

int main() {
    Node* a = readList();
    Node* b = readList();
    printList(merge(a, b));
}
