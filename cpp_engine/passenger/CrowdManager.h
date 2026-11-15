#ifndef CROWD_MANAGER_H
#define CROWD_MANAGER_H
// Member 2: custom passenger queue and crowd ranking. No STL containers.
struct PassengerGroup { int from, to, count; };
class PassengerQueue {
 struct Node { PassengerGroup value; Node* next; Node(PassengerGroup v):value(v),next(0){} };
 Node *head, *tail;
public:
 PassengerQueue():head(0),tail(0){}
 ~PassengerQueue();
 void enqueue(PassengerGroup group);
 bool dequeue(PassengerGroup &group);
 bool empty() const { return head==0; }
private:
 PassengerQueue(const PassengerQueue&);
 PassengerQueue& operator=(const PassengerQueue&);
};
struct CrowdStation { int index; double percentage; };
class CrowdManager {
public:
 static void sortByCrowd(CrowdStation* stations, int count);
};
#endif
