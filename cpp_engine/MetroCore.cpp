#include "MetroCore.h"
#include <stdexcept>
#include <limits>

MetroGraph::MetroGraph() : stations(0), count(0), capacity(0), buckets(0), bucketCount(0) {}
MetroGraph::~MetroGraph() {
    for (int i = 0; i < count; ++i) {
        Edge* e = stations[i].first;
        while (e) { Edge* next = e->next; delete e; e = next; }
    }
    delete[] stations;
    for (int i=0;i<bucketCount;++i) {
        HashEntry* e=buckets[i];
        while(e) { HashEntry* next=e->next; delete e; e=next; }
    }
    delete[] buckets;
}
unsigned long MetroGraph::hashId(const std::string& id) const {
    unsigned long h=2166136261UL;
    for (int i=0;i<(int)id.size();++i) h=(h ^ (unsigned char)id[i])*16777619UL;
    return h;
}
void MetroGraph::rehash(int newCount) {
    HashEntry** fresh=new HashEntry*[newCount];
    for(int i=0;i<newCount;++i) fresh[i]=0;
    try {
        for(int i=0;i<count;++i) {
            int slot=(int)(hashId(stations[i].id)%newCount);
            fresh[slot]=new HashEntry(i,fresh[slot]);
        }
    } catch(...) {
        for(int i=0;i<newCount;++i) { HashEntry* e=fresh[i]; while(e) { HashEntry* next=e->next; delete e; e=next; } }
        delete[] fresh; throw;
    }
    for(int i=0;i<bucketCount;++i) { HashEntry* e=buckets[i]; while(e) { HashEntry* next=e->next; delete e; e=next; } }
    delete[] buckets; buckets=fresh; bucketCount=newCount;
}
void MetroGraph::expand() {
    int nextCapacity = capacity ? capacity * 2 : 8;
    Station* fresh = new Station[nextCapacity];
    for (int i = 0; i < count; ++i) fresh[i] = stations[i];
    delete[] stations;
    stations = fresh;
    capacity = nextCapacity;
}
int MetroGraph::indexOf(const std::string& id) const {
    if (!bucketCount) return -1;
    for(HashEntry* e=buckets[hashId(id)%bucketCount];e;e=e->next)
        if(stations[e->station].id==id) return e->station;
    return -1;
}
int MetroGraph::addStation(const std::string& id, double crowdRatio) {
    if (id.empty() || crowdRatio < 0) throw std::invalid_argument("Invalid station data");
    int existing = indexOf(id);
    if (existing >= 0) return existing;
    if (count == capacity) expand();
    if (!bucketCount || (count+1)*4 >= bucketCount*3) rehash(bucketCount ? bucketCount*2+1 : 17);
    // Allocate the hash node first so a failed allocation cannot leave an unindexed station.
    int slot=(int)(hashId(id)%bucketCount);
    HashEntry* entry=new HashEntry(count,buckets[slot]);
    try { stations[count].id=id; } catch(...) { delete entry; throw; }
    stations[count].crowd=crowdRatio;
    buckets[slot]=entry;
    return count++;
}
const std::string& MetroGraph::idOf(int i) const {
    if (i < 0 || i >= count) throw std::out_of_range("Invalid station index");
    return stations[i].id;
}
double MetroGraph::crowdAt(int i) const {
    if (i < 0 || i >= count) throw std::out_of_range("Invalid station index");
    return stations[i].crowd;
}
void MetroGraph::setCrowd(int i, double ratio) {
    if (i < 0 || i >= count || ratio < 0) throw std::invalid_argument("Invalid crowd update");
    stations[i].crowd = ratio;
}
void MetroGraph::addConnection(int from, int to, double minutes, double km) {
    if (from < 0 || to < 0 || from >= count || to >= count || minutes < 0 || km < 0)
        throw std::invalid_argument("Invalid connection");
    if (from == to) return;
    // Allocate before modifying either list to keep the graph unchanged if allocation fails.
    Edge* a = new Edge(to, minutes, km, stations[from].first);
    Edge* b = 0;
    try { b = new Edge(from, minutes, km, stations[to].first); }
    catch (...) { delete a; throw; }
    stations[from].first = a;
    stations[to].first = b;
}
const Edge* MetroGraph::neighbors(int i) const {
    if (i < 0 || i >= count) throw std::out_of_range("Invalid station index");
    return stations[i].first;
}
int MetroGraph::size() const { return count; }

MinHeap::MinHeap() : items(0), used(0), capacity(0) {}
MinHeap::~MinHeap() { delete[] items; }
bool MinHeap::empty() const { return used == 0; }
void MinHeap::grow() {
    int nextCapacity = capacity ? capacity * 2 : 8;
    HeapEntry* fresh = new HeapEntry[nextCapacity];
    for (int i = 0; i < used; ++i) fresh[i] = items[i];
    delete[] items; items = fresh; capacity = nextCapacity;
}
void MinHeap::push(double cost, int station) {
    if (used == capacity) grow();
    int i = used++;
    while (i > 0 && items[(i - 1) / 2].cost > cost) {
        items[i] = items[(i - 1) / 2]; i = (i - 1) / 2;
    }
    items[i].cost = cost; items[i].station = station;
}
HeapEntry MinHeap::pop() {
    if (!used) throw std::out_of_range("Heap empty");
    HeapEntry result = items[0];
    HeapEntry last = items[--used];
    if (used) {
        int i = 0;
        while (2 * i + 1 < used) {
            int child = 2 * i + 1;
            if (child + 1 < used && items[child + 1].cost < items[child].cost) ++child;
            if (last.cost <= items[child].cost) break;
            items[i] = items[child]; i = child;
        }
        items[i] = last;
    }
    return result;
}

RouteResult::RouteResult(const RouteResult& other)
    : found(other.found), nodes(0), length(other.length), cost(other.cost),
      minutes(other.minutes), kilometres(other.kilometres) {
    if (length) { nodes = new int[length]; for (int i=0;i<length;++i) nodes[i]=other.nodes[i]; }
}
RouteResult& RouteResult::operator=(const RouteResult& other) {
    if (this == &other) return *this;
    int* fresh = other.length ? new int[other.length] : 0;
    for (int i=0;i<other.length;++i) fresh[i]=other.nodes[i];
    delete[] nodes; nodes=fresh; length=other.length; found=other.found;
    cost=other.cost; minutes=other.minutes; kilometres=other.kilometres;
    return *this;
}

RouteResult findRoute(const MetroGraph& graph, int source, int destination, double crowdWeight) {
    RouteResult result;
    int n = graph.size();
    if (source < 0 || destination < 0 || source >= n || destination >= n || crowdWeight < 0)
        return result;
    const double INF = std::numeric_limits<double>::infinity();
    double* dist = new double[n];
    int* parent = new int[n];
    double* travel = new double[n];
    double* km = new double[n];
    for (int i=0;i<n;++i) { dist[i]=INF; parent[i]=-1; travel[i]=0; km[i]=0; }
    MinHeap heap;
    dist[source]=0;
    heap.push(0,source);
    while (!heap.empty()) {
        HeapEntry current=heap.pop();
        int u=current.station;
        if (current.cost > dist[u]) continue;
        if (u == destination) break;
        for (const Edge* e=graph.neighbors(u); e; e=e->next) {
            double weight=e->minutes*(1.0+crowdWeight*graph.crowdAt(e->to));
            double proposed=dist[u]+weight;
            if (proposed < dist[e->to]) {
                dist[e->to]=proposed;
                parent[e->to]=u;
                travel[e->to]=travel[u]+e->minutes;
                km[e->to]=km[u]+e->kilometres;
                heap.push(proposed,e->to);
            }
        }
    }
    if (dist[destination] != INF) {
        int length=0;
        for (int v=destination;v!=-1;v=parent[v]) ++length;
        result.nodes=new int[length]; result.length=length;
        int v=destination;
        for (int i=length-1;i>=0;--i) { result.nodes[i]=v; v=parent[v]; }
        result.found=true; result.cost=dist[destination];
        result.minutes=travel[destination]; result.kilometres=km[destination];
    }
    delete[] dist; delete[] parent; delete[] travel; delete[] km;
    return result;
}
