#include "MetroCore.h"
#include <iostream>
#include <iomanip>
// Text protocol, one request per process. Node handles JSON; C++ handles all graph algorithms.
int main() {
    int n,m,source,dest;
    double weight;
    if (!(std::cin >> n >> m >> source >> dest >> weight) || n<1 || n>10000 || m<0 || m>200000) return 2;
    MetroGraph graph;
    for(int i=0;i<n;i++) { std::string id; double crowd; if(!(std::cin>>id>>crowd))return 2; graph.addStation(id,crowd); }
    for(int i=0;i<m;i++) { int u,v; double time,km; if(!(std::cin>>u>>v>>time>>km))return 2; graph.addConnection(u,v,time,km); }
    RouteResult route=findRoute(graph,source,dest,weight);
    if(!route.found) {std::cout << "NO_ROUTE\n";return 0;}
    std::cout<<std::setprecision(12)<<route.length<<' '<<route.minutes<<' '<<route.kilometres<<' '<<route.cost<<'\n';
    for(int i=0;i<route.length;i++)std::cout<<route.nodes[i]<<(i+1==route.length?'\n':' ');
}
