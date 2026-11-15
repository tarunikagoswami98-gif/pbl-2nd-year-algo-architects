#include "CrowdManager.h"
PassengerQueue::~PassengerQueue() { PassengerGroup group; while(dequeue(group)){} }
void PassengerQueue::enqueue(PassengerGroup group) {
 Node* n=new Node(group);
 if(tail)tail->next=n;else head=n;
 tail=n;
}
bool PassengerQueue::dequeue(PassengerGroup &group) {
 if(!head)return false;
 Node* old=head;group=old->value;head=head->next;
 if(!head)tail=0;
 delete old;return true;
}
void CrowdManager::sortByCrowd(CrowdStation* stations,int count) {
 for(int i=1;i<count;i++) {
  CrowdStation item=stations[i];int j=i-1;
  while(j>=0 && stations[j].percentage<item.percentage) {stations[j+1]=stations[j];j--;}
  stations[j+1]=item;
 }
}
