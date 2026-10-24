#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* next;
};

// Visualize this one: watch the arrows as the linked list is built.
int main() {
    int x = 10;
    int* p = &x;     // p holds the ADDRESS of x
    int& r = x;      // r is another NAME for x
    *p = 20;
    r = r + 1;
    cout << "x = " << x << endl;

    Node* head = nullptr;
    for (int i = 3; i >= 1; i--) {
        head = new Node{i, head};   // push to the front
    }
    for (Node* cur = head; cur != nullptr; cur = cur->next) {
        cout << cur->value << " ";
    }
    cout << endl;
    return 0;
}
