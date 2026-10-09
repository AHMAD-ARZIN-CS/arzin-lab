#include <iostream>
#include <string>
using namespace std;

// Programs can read input: type it in the Input box, or interactively in the Output panel.
int main() {
    string name;
    int age;
    cout << "What's your name? ";
    cin >> name;
    cout << "How old are you? ";
    cin >> age;
    cout << "Hi " << name << ", in 10 years you'll be " << age + 10 << "." << endl;
    return 0;
}
