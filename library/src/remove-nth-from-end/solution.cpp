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

Node* removeKthFromEnd(Node* head, int k) {
    Node dummy{0, head};
    Node* fast = &dummy;
    Node* slow = &dummy;
    for (int i = 0; i < k; i++) fast = fast->next;
    while (fast->next) { fast = fast->next; slow = slow->next; }
    Node* gone = slow->next;
    slow->next = gone->next;
    delete gone;
    return dummy.next;
}

int main() {
    Node* head = readList();
    int k;
    cin >> k;
    printList(removeKthFromEnd(head, k));
}
