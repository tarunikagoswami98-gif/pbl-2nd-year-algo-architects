#include "CrowdManager.h"
#include <iostream>
#include <iomanip>
#include <string>
// RANK: n, then n crowd percentages; returns indices descending by crowd.
// QUEUE: n, then n (sourceIndex destinationIndex passengerCount); returns FIFO trips.
int main() {
 std::string mode;int n;
 if(!(std::cin>>mode>>n)||n<0||n>100000)return 2;
 if(mode=="RANK") {
  CrowdStation* a=new CrowdStation[n];
  for(int i=0;i<n;i++) {a[i].index=i;if(!(std::cin>>a[i].percentage)){delete[] a;return 2;}}
  CrowdManager::sortByCrowd(a,n);
  for(int i=0;i<n;i++)std::cout<<a[i].index<<'\n';
  delete[] a;return 0;
 }
 if(mode=="QUEUE") {
  PassengerQueue q;
  for(int i=0;i<n;i++) {
   PassengerGroup p;if(!(std::cin>>p.from>>p.to>>p.count)||p.count<1)return 2;
   q.enqueue(p);
  }
  PassengerGroup p;
  while(q.dequeue(p))std::cout<<p.from<<' '<<p.to<<' '<<p.count<<'\n';
  return 0;
 }
 return 2;
}
